import { Tabs, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "../../src/theme";
import { useAuth } from "../../src/AuthContext";
import { NotificationProvider } from "../../src/NotificationContext";
import { DocumentProvider } from "../../src/DocumentContext";

function OwnerTabs() {
  const colors = useColors();
  const { state } = useAuth();
  const insets = useSafeAreaInsets();

  // Redirect guests to the auth screen — declarative, works from any navigator level
  if (state.status === "guest") {
    return <Redirect href="/(auth)/welcome" />;
  }

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
          paddingBottom: insets.bottom || 8,
          height: 64 + (insets.bottom || 0),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Fleet",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="business-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: "Earnings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="driver-mode"
        options={{
          title: "Drive",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="car-sport-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="trip-centre"
        options={{ href: null, tabBarButton: () => null }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      {/* All hidden screens — tabBarButton: () => null prevents any button rendering */}
      <Tabs.Screen name="notifications" options={{ href: null, tabBarButton: () => null }} />
      <Tabs.Screen name="documents"     options={{ href: null, tabBarButton: () => null }} />
      <Tabs.Screen name="statement"     options={{ href: null, tabBarButton: () => null }} />
      <Tabs.Screen name="driver"        options={{ href: null, tabBarButton: () => null }} />
    </Tabs>
  );
}

export default function OwnerTabLayout() {
  return (
    <NotificationProvider>
      <DocumentProvider>
        <OwnerTabs />
      </DocumentProvider>
    </NotificationProvider>
  );
}
