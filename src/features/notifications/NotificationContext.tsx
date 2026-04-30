import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType = "success" | "error" | "info" | "warning";

export interface Notification {
  id: string;
  message: string;
  description?: string;
  type: NotificationType;
  createdAt: Date;
  isRead: boolean;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  add: (n: Pick<Notification, "message" | "description" | "type">) => void;
  markAllAsRead: () => void;
  markAsRead: (id: string) => void;
  clearAll: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const NotificationContext = createContext<NotificationContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

const MAX_HISTORY = 50;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const add = useCallback(
    ({ message, description, type }: Pick<Notification, "message" | "description" | "type">) => {
      setNotifications((prev) =>
        [
          {
            id: crypto.randomUUID(),
            message,
            description,
            type,
            createdAt: new Date(),
            isRead: false,
          } satisfies Notification,
          ...prev,
        ].slice(0, MAX_HISTORY),
      );
    },
    [],
  );

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, add, markAllAsRead, markAsRead, clearAll }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNotificationContext(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotificationContext must be used inside <NotificationProvider>");
  return ctx;
}
