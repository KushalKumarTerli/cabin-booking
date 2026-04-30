import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { type Notification, useNotificationContext } from "./NotificationContext";

// ── Color map ────────────────────────────────────────────────────────────────

const TYPE_DOT: Record<Notification["type"], string> = {
  success: "bg-green-500",
  error:   "bg-red-500",
  info:    "bg-blue-500",
  warning: "bg-amber-500",
};

// ── NotificationBell ─────────────────────────────────────────────────────────

export function NotificationBell() {
  const { notifications, unreadCount, markAllAsRead, clearAll } = useNotificationContext();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    // Mark all read the moment the panel opens so the badge resets
    if (next) markAllAsRead();
  };

  return (
    <div ref={rootRef} className="relative">

      {/* ── Bell trigger ── */}
      <button
        type="button"
        onClick={handleToggle}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-md transition-colors",
          "hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          open && "bg-muted",
        )}
      >
        <Bell className={cn("h-[18px] w-[18px] transition-colors", open ? "text-foreground" : "text-foreground/70")} />

        {/* Badge */}
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">

          {/* Panel header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Notifications</h3>
              {notifications.length > 0 && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {notifications.length}
                </span>
              )}
            </div>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                title="Clear all"
                className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-[420px] divide-y divide-border/50 overflow-y-auto">
            {notifications.length === 0 ? (
              <EmptyState />
            ) : (
              notifications.map((n) => <NotificationItem key={n.id} n={n} />)
            )}
          </div>

          {/* Panel footer */}
          {notifications.length > 0 && (
            <div className="flex justify-end border-t px-4 py-2">
              <button
                type="button"
                onClick={markAllAsRead}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-primary"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all as read
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── NotificationItem ─────────────────────────────────────────────────────────

function NotificationItem({ n }: { n: Notification }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
        !n.isRead && "bg-blue-50/40",
      )}
    >
      {/* Type dot */}
      <div className={cn("mt-[5px] h-2 w-2 shrink-0 rounded-full", TYPE_DOT[n.type])} />

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[13px] leading-snug",
            n.isRead ? "font-normal text-foreground/75" : "font-medium text-foreground",
          )}
        >
          {n.message}
        </p>
        {n.description && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{n.description}</p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground/60">
          {formatDistanceToNow(n.createdAt, { addSuffix: true })}
        </p>
      </div>

      {/* Unread pip */}
      {!n.isRead && (
        <div className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
      )}
    </div>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <Bell className="mb-3 h-10 w-10 text-muted-foreground/20" />
      <p className="text-sm font-medium text-muted-foreground">No notifications yet</p>
      <p className="mt-1 text-xs text-muted-foreground/60">
        Booking updates will appear here
      </p>
    </div>
  );
}
