import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/AuthContext";
import { useTheme } from "../../src/ThemeContext";
import { NotificationProvider, useNotifications } from "../../src/NotificationContext";
import { DocumentProvider } from "../../src/DocumentContext";

function NotifTabIcon({ color, size }: { color: string; size: number }) {
  const { unreadCount } = useNotifications();
  return (
    <View>
      <Ionicons name="notifications-outline" size={size} color={color} />
      {unreadCount > 0 && (
        <View style={badge.wrap}>
          <Text style={badge.text}>{unreadCount > 9 ? "9+" : String(unreadCount)}</Text>
        </View>
      )}
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: {
    position: "absolute", top: -4, right: -7,
    backgroundColor: "#FF3B30", borderRadius: 8,
    minWidth: 16, height: 16,
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 2,
  },
  text: { color: "#fff", fontSize: 9, fontWeight: "800" },
});

function AppTabs() {
  const router = useRouter();
  const { state } = useAuth();
  const { colors } = useTheme();

  useEffect(() => {
    if (state.status === "guest") router.replace("/(auth)/welcome");
    else if (state.status === "authed" && state.user.role === "owner") router.replace("/owner");
  }, [state.status, router]);

  if (state.status !== "authed") return null;

  const isDriver = state.user.role === "driver";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.cyan,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.bg2,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingTop: 6,
          height: 64,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}>

      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="action"
        options={{
          title: isDriver ? "My QR" : "Scan & Pay",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={isDriver ? "qr-code" : "scan"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="trip-centre"
        options={{
          title: "Trip Centre",
          href: isDriver ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="car-sport-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: "History",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          href: null,
          tabBarIcon: ({ color, size }) => (
            <NotifTabIcon color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Hidden screens */}
      <Tabs.Screen name="topup" options={{ href: null }} />
      <Tabs.Screen name="withdraw" options={{ href: null }} />
      <Tabs.Screen name="kyc" options={{ href: null }} />
      <Tabs.Screen name="my-qr" options={{ href: null }} />
      <Tabs.Screen name="transfer" options={{ href: null }} />
      <Tabs.Screen name="statement" options={{ href: null }} />
      <Tabs.Screen name="payslip" options={{ href: null }} />
      <Tabs.Screen name="documents" options={{ href: null }} />
      <Tabs.Screen name="safety" options={{ href: null }} />
      <Tabs.Screen name="saferide-trip" options={{ href: null }} />
    </Tabs>
  );
}

export default function AppLayout() {
  return (
    <NotificationProvider>
      <DocumentProvider>
        <AppTabs />
      </DocumentProvider>
    </NotificationProvider>
  );
}
