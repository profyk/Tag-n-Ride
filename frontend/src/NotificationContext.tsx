import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, Notification } from "./api";
import { useAuth } from "./AuthContext";

type NotifContextType = {
  notifications: Notification[];
  unreadCount: number;
  markAllRead: () => void;
  refresh: () => void;
};

const NotifContext = createContext<NotifContextType>({
  notifications: [],
  unreadCount: 0,
  markAllRead: () => {},
  refresh: () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [lastReadAt, setLastReadAt] = useState<string>("0");

  const STORAGE_KEY = state.status === "authed"
    ? `tnr_notif_read_${state.user.id}`
    : "tnr_notif_read";

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(v => {
      if (v) setLastReadAt(v);
    });
  }, [STORAGE_KEY]);

  const load = useCallback(async () => {
    if (state.status !== "authed") return;
    try {
      const data = await api.getNotifications();
      setNotifications(data);
    } catch {}
  }, [state.status]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setLastReadAt(now);
    await AsyncStorage.setItem(STORAGE_KEY, now);
  }, [STORAGE_KEY]);

  const unreadCount = notifications.filter(
    n => new Date(n.sent_at) > new Date(lastReadAt)
  ).length;

  return (
    <NotifContext.Provider value={{
      notifications,
      unreadCount,
      markAllRead,
      refresh: load,
    }}>
      {children}
    </NotifContext.Provider>
  );
}

export const useNotifications = () => useContext(NotifContext);
