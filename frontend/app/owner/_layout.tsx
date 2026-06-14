import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../src/theme";
import { NotificationProvider } from "../../src/NotificationContext";
import { DocumentProvider } from "../../src/DocumentContext";

function OwnerTabs() {
  const colors = useColors();

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
        options={{ href: null, tabBarItemStyle: { display: "none" } }}
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
      <Tabs.Screen name="notifications" options={{ href: null, tabBarItemStyle: { display: "none" } }} />
      <Tabs.Screen name="documents"     options={{ href: null, tabBarItemStyle: { display: "none" } }} />
      <Tabs.Screen name="statement"     options={{ href: null, tabBarItemStyle: { display: "none" } }} />
      <Tabs.Screen name="driver"        options={{ href: null, tabBarItemStyle: { display: "none" } }} />
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
