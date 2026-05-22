import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";
import { useAuth } from "./AuthContext";

type Notification = {
  id: string;
  title: string;
  message: string;
  type: string;
  sent_at: string;
  read?: boolean;
};

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
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (state.status !== "authed") return;
    try {
      const data = await api.getNotifications();
      setNotifications(data);
    } catch {}
  }, [state.status]);

  useEffect(() => {
    load();
    // Poll every 60 seconds
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  const markAllRead = () => {
    setReadIds(new Set(notifications.map(n => n.id)));
  };

  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

  return (
    <NotifContext.Provider value={{ notifications, unreadCount, markAllRead, refresh: load }}>
      {children}
    </NotifContext.Provider>
  );
}

export const useNotifications = () => useContext(NotifContext);
