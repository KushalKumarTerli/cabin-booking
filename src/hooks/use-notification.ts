/**
 * useNotification — domain-aware notification hook.
 *
 * Every booking domain method does two things:
 *   1. Fires a sonner toast (ephemeral, auto-dismisses)
 *   2. Adds a persistent entry to the NotificationBell history
 *
 * Generic helpers (success/error/info/warning) only fire a toast — they
 * handle technical messages that don't belong in the booking bell history.
 */

import { toast } from "sonner";
import { formatTime12h } from "@/lib/booking-utils";
import { useNotificationContext } from "@/features/notifications/NotificationContext";

// ── Duration constants ────────────────────────────────────────────────────────

const DURATION_SUCCESS = 4500;
const DURATION_ERROR   = 6000;
const DURATION_INFO    = 4000;

// ── Shared data shape ─────────────────────────────────────────────────────────

export interface BookingNotificationData {
  cabinName: string;
  startTime: string; // "HH:MM:SS" 24-hour
  endTime?: string;  // "HH:MM:SS" 24-hour
  date?: string;     // "YYYY-MM-DD"
}

// ── Helper ────────────────────────────────────────────────────────────────────

function fmtRange(startTime: string, endTime?: string): string {
  const start = formatTime12h(startTime);
  return endTime ? `${start} – ${formatTime12h(endTime)}` : start;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useNotification() {
  const { add } = useNotificationContext();

  return {
    // ── Generic methods — toast only, not added to bell ──────────────────────

    /** Green toast for generic success messages. */
    success(message: string) {
      toast.success(message, { duration: DURATION_SUCCESS });
    },

    /** Red toast for technical/generic errors. */
    error(message: string) {
      toast.error(message, { duration: DURATION_ERROR });
    },

    /** Blue toast for generic info. */
    info(message: string) {
      toast.info(message, { duration: DURATION_INFO });
    },

    /** Amber toast for generic warnings. */
    warning(message: string) {
      toast.warning(message, { duration: DURATION_INFO });
    },

    // ── Booking domain methods — toast + bell ────────────────────────────────

    /**
     * Shown right after a booking is inserted.
     * Toast: green. Bell: green dot.
     *
     * Toast title:       "Cabin C1 booked"
     * Toast/bell desc:   "03:00 PM – 03:45 PM  ·  2026-04-30"
     */
    bookingCreated({ cabinName, startTime, endTime, date }: BookingNotificationData) {
      const desc = [fmtRange(startTime, endTime), date].filter(Boolean).join("  ·  ");
      const title = `${cabinName} booked`;
      toast.success(title, { description: desc || undefined, duration: DURATION_SUCCESS });
      add({ message: title, description: desc || undefined, type: "success" });
    },

    /**
     * Shown when the user cancels their own booking.
     * Toast: red. Bell: red dot.
     *
     * Toast title:       "Booking cancelled"
     * Toast/bell desc:   "Cabin C1  ·  03:00 PM  ·  2026-04-30"
     */
    bookingCancelled({ cabinName, startTime, date }: BookingNotificationData) {
      const desc = [cabinName, formatTime12h(startTime), date].filter(Boolean).join("  ·  ");
      toast.error("Booking cancelled", { description: desc || undefined, duration: DURATION_ERROR });
      add({ message: "Booking cancelled", description: desc || undefined, type: "error" });
    },

    /**
     * Shown when an existing booking is edited.
     * Toast: blue. Bell: blue dot.
     *
     * Toast title:       "Booking updated"
     * Toast/bell desc:   "Cabin C1  ·  03:00 PM – 03:45 PM"
     */
    bookingUpdated({ cabinName, startTime, endTime }: BookingNotificationData) {
      const desc = [cabinName, fmtRange(startTime, endTime)].filter(Boolean).join("  ·  ");
      toast.info("Booking updated", { description: desc || undefined, duration: DURATION_INFO });
      add({ message: "Booking updated", description: desc || undefined, type: "info" });
    },

    /**
     * Shown for admin force-cancel / override / delete actions.
     * Toast: blue (info) or amber (deleted). Bell: matching dot.
     *
     * Toast title:       "Booking overridden"
     * Toast/bell desc:   "Cabin C1  ·  03:00 PM"
     */
    adminAction(
      action: "cancelled" | "overridden" | "deleted",
      cabinName: string,
      startTime?: string,
    ) {
      const desc = [cabinName, startTime ? formatTime12h(startTime) : undefined]
        .filter(Boolean)
        .join("  ·  ");
      const title = `Booking ${action}`;
      const type = action === "deleted" ? "warning" : "info";

      if (type === "warning") {
        toast.warning(title, { description: desc || undefined, duration: DURATION_INFO });
      } else {
        toast.info(title, { description: desc || undefined, duration: DURATION_INFO });
      }
      add({ message: title, description: desc || undefined, type });
    },

    /**
     * Shown when a booking creation fails due to a concurrency conflict.
     * Toast: red. Bell: red dot.
     */
    bookingConflict() {
      const message = "Slot no longer available";
      const description = "This cabin was just booked by someone else. Choose a different time or cabin.";
      toast.error(message, { description, duration: DURATION_ERROR });
      add({ message, description, type: "error" });
    },
  };
}
