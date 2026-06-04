import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";
import { useAuth } from "./AuthContext";

type DocumentContextType = {
  unreadCount: number;
  refreshCount: () => void;
};

const DocumentContext = createContext<DocumentContextType>({
  unreadCount: 0,
  refreshCount: () => {},
});

export function DocumentProvider({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshCount = useCallback(async () => {
    if (state.status !== "authed") return;
    try {
      const data = await api.documentsUnreadCount();
      setUnreadCount(data.count);
    } catch {}
  }, [state.status]);

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 60000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  return (
    <DocumentContext.Provider value={{ unreadCount, refreshCount }}>
      {children}
    </DocumentContext.Provider>
  );
}

export const useDocuments = () => useContext(DocumentContext);
