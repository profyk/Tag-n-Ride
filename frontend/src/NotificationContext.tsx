import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, Notification } from "./api";
import { useAuth } from "./AuthContext";

type NotifContextType = {
  notifications: Notification[];
  unreadCount: number;
  isRead: (id: string) => boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
  deleteNotification: (id: string) => void;
  refresh: () => Promise<void>;
};

const NotifContext = createContext<NotifContextType>({
  notifications: [],
  unreadCount: 0,
  isRead: () => false,
  markRead: () => {},
  markAllRead: () => {},
  deleteNotification: () => {},
  refresh: () => Promise.resolve(),
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const STORAGE_KEY = state.status === "authed"
    ? `tnr_notif_read_ids_${state.user.id}`
    : "tnr_notif_read_ids";

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(v => {
      if (v) {
        try { setReadIds(new Set(JSON.parse(v))); return; } catch {}
      }
      setReadIds(new Set());
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

  const markRead = useCallback((id: string) => {
    setReadIds(prev => {
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  }, [STORAGE_KEY]);

  const markAllRead = useCallback(() => {
    setReadIds(prev => {
      const next = new Set(prev);
      notifications.forEach(n => next.add(n.id));
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  }, [notifications, STORAGE_KEY]);

  const deleteNotification = useCallback(async (id: string) => {
    try {
      await api.deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch {}
  }, []);

  const isRead = useCallback((id: string) => readIds.has(id), [readIds]);

  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

  return (
    <NotifContext.Provider value={{
      notifications,
      unreadCount,
      isRead,
      markRead,
      markAllRead,
      deleteNotification,
      refresh: load,
    }}>
      {children}
    </NotifContext.Provider>
  );
}

export const useNotifications = () => useContext(NotifContext);
