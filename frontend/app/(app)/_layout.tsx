import React, { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/AuthContext";
import { colors } from "../../src/theme";
import { NotificationProvider } from "../../src/NotificationContext";

export default function AppLayout() {
  const router = useRouter();
  const { state } = useAuth();

  useEffect(() => {
    if (state.status === "guest") router.replace("/(auth)/welcome");
  }, [state.status, router]);

  if (state.status !== "authed") return null;

  const isDriver = state.user.role === "driver";

  return (
    <NotificationProvider>
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

        {/* Earnings tab — drivers only */}
        <Tabs.Screen
          name="earnings"
          options={{
            title: "Earnings",
            href: isDriver ? undefined : null,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="cash-outline" size={size} color={color} />
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
        <Tabs.Screen name="notifications" options={{ href: null }} />
      </Tabs>
    </NotificationProvider>
  );
}
