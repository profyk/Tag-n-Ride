import React from "react";
import { Text, TextInput, TouchableOpacity, View, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, space } from "./theme";

export const Card: React.FC<{ children: React.ReactNode; style?: ViewStyle; testID?: string }> = ({ children, style, testID }) => (
  <View testID={testID} style={[styles.card, style]}>{children}</View>
);

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "destructive" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
  style?: ViewStyle;
  fullWidth?: boolean;
};

export const Button: React.FC<ButtonProps> = ({
  label, onPress, variant = "primary", loading, disabled, icon, testID, style, fullWidth = true,
}) => {
  const isDisabled = !!loading || !!disabled;
  const palette = {
    primary: { bg: colors.cyan, fg: "#001218", border: colors.cyan },
    secondary: { bg: "transparent", fg: colors.cyan, border: colors.cyan },
    destructive: { bg: colors.redDim, fg: colors.red, border: colors.red },
    ghost: { bg: "transparent", fg: colors.text, border: "transparent" },
  }[variant];

  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.85}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.btn,
        fullWidth && { alignSelf: "stretch" },
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: isDisabled ? 0.5 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.btnRow}>
          {icon ? <Ionicons name={icon} size={18} color={palette.fg} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.btnText, { color: palette.fg }]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

type FieldProps = {
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "phone-pad" | "number-pad" | "decimal-pad";
  secureTextEntry?: boolean;
  maxLength?: number;
  testID?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  style?: ViewStyle;
  inputStyle?: TextStyle;
  toggleSecure?: boolean;
  leftAddon?: React.ReactNode;
};

export const Field: React.FC<FieldProps> = ({ label, value, onChangeText, placeholder, keyboardType, secureTextEntry, maxLength, testID, autoCapitalize, style, inputStyle, toggleSecure, leftAddon }) => {
  const [hidden, setHidden] = React.useState(!!secureTextEntry);
  const isSecure = !!secureTextEntry && hidden;
  return (
    <View style={[{ marginBottom: space.md }, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputRow}>
        {leftAddon}
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textDim}
          keyboardType={keyboardType}
          secureTextEntry={isSecure}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          style={[styles.input, leftAddon ? styles.inputWithAddon : null, toggleSecure ? styles.inputWithRight : null, inputStyle]}
        />
        {toggleSecure && secureTextEntry ? (
          <TouchableOpacity
            testID={testID ? `${testID}-toggle` : undefined}
            onPress={() => setHidden((h) => !h)}
            activeOpacity={0.85}
            style={styles.eyeBtn}
          >
            <Ionicons name={hidden ? "eye-outline" : "eye-off-outline"} size={20} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

export const CountryChip: React.FC<{ testID?: string }> = ({ testID }) => (
  <View testID={testID} style={styles.country}>
    <Text style={styles.countryFlag}>🇿🇦</Text>
    <Text style={styles.countryCode}>+27</Text>
  </View>
);

export const PoweredBy: React.FC<{ light?: boolean; testID?: string }> = ({ light, testID }) => (
  <View testID={testID} style={styles.poweredBy}>
    <Text style={[styles.poweredByText, light && { color: colors.textMuted }]}>
      Powered by <Text style={styles.poweredByBrand}>BukkaPay Technologies</Text>
    </Text>
  </View>
);

export const Pill: React.FC<{ label: string; tone?: "cyan" | "green" | "red" | "yellow" | "muted"; testID?: string }> = ({ label, tone = "muted", testID }) => {
  const map = {
    cyan: { bg: colors.cyanDim, fg: colors.cyan },
    green: { bg: colors.greenDim, fg: colors.green },
    red: { bg: colors.redDim, fg: colors.red },
    yellow: { bg: "rgba(255,214,10,0.12)", fg: colors.yellow },
    muted: { bg: "rgba(255,255,255,0.06)", fg: colors.textMuted },
  }[tone];
  return (
    <View testID={testID} style={[styles.pill, { backgroundColor: map.bg }]}>
      <Text style={[styles.pillText, { color: map.fg }]}>{label}</Text>
    </View>
  );
};

export const ScreenHeader: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode }> = ({ title, subtitle, right }) => (
  <View style={styles.header}>
    <View style={{ flex: 1 }}>
      <Text style={styles.headerTitle}>{title}</Text>
      {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
    </View>
    {right}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg2,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 20,
  },
  btn: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  btnRow: { flexDirection: "row", alignItems: "center" },
  btnText: { fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: "600", marginBottom: 6, letterSpacing: 0.4, textTransform: "uppercase" },
  inputRow: { flexDirection: "row", alignItems: "stretch", position: "relative" },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.sm + 4,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
  },
  inputWithAddon: { borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeftWidth: 0 },
  inputWithRight: { paddingRight: 44 },
  eyeBtn: { position: "absolute", right: 0, top: 0, bottom: 0, width: 44, alignItems: "center", justifyContent: "center" },
  country: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, backgroundColor: colors.bg2, borderTopLeftRadius: radius.sm + 4, borderBottomLeftRadius: radius.sm + 4, borderWidth: 1, borderColor: colors.borderStrong, gap: 6 },
  countryFlag: { fontSize: 18 },
  countryCode: { color: colors.text, fontWeight: "700", fontSize: 15 },
  poweredBy: { alignItems: "center", marginTop: 16 },
  poweredByText: { color: colors.textDim, fontSize: 11, letterSpacing: 0.5 },
  poweredByBrand: { color: colors.cyan, fontWeight: "800", letterSpacing: 0.6 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" },
  pillText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  headerTitle: { color: colors.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  headerSub: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
});
