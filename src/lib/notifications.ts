/**
 * Notification architecture — prepared for future integration.
 * Wire up dispatchNotification() to a real provider (Supabase Edge Functions,
 * Resend, Firebase Cloud Messaging, etc.) when needed.
 */

export type NotificationChannel = "email" | "push" | "in_app";

export type NotificationEvent =
  | "booking_confirmed"
  | "booking_cancelled"
  | "booking_reminder"
  | "cabin_now_available"
  | "cabin_occupied";

export interface NotificationPayload {
  event: NotificationEvent;
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  channels: NotificationChannel[];
  scheduledFor?: string; // ISO-8601 datetime — omit for immediate delivery
}

// ── Typed data shapes ────────────────────────────────────────────────────────

export interface BookingEventData {
  bookingId: string;
  cabinName: string;
  floor: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  candidateCount: number;
  managerName: string;
}

export interface CabinAvailableData {
  cabinId: string;
  cabinName: string;
  floor: string;
  availableFrom: string; // HH:MM
}

export interface CabinOccupiedData {
  cabinId: string;
  cabinName: string;
  occupantName: string;
  endTime: string;
}

// ── Payload builders ─────────────────────────────────────────────────────────

export function buildBookingConfirmedPayload(
  userId: string,
  data: BookingEventData,
): NotificationPayload {
  return { event: "booking_confirmed", userId, data, channels: ["in_app", "email"] };
}

export function buildBookingCancelledPayload(
  userId: string,
  data: BookingEventData,
): NotificationPayload {
  return { event: "booking_cancelled", userId, data, channels: ["in_app", "email"] };
}

export function buildBookingReminderPayload(
  userId: string,
  data: BookingEventData,
  minutesBefore = 15,
): NotificationPayload {
  return {
    event: "booking_reminder",
    userId,
    data: { ...data, minutesBefore },
    channels: ["in_app"],
  };
}

export function buildCabinAvailablePayload(
  userId: string,
  data: CabinAvailableData,
): NotificationPayload {
  return { event: "cabin_now_available", userId, data, channels: ["in_app"] };
}

export function buildCabinOccupiedPayload(
  userId: string,
  data: CabinOccupiedData,
): NotificationPayload {
  return { event: "cabin_occupied", userId, data, channels: ["in_app"] };
}

// ── Dispatcher (no-op until a provider is wired up) ──────────────────────────

export async function dispatchNotification(payload: NotificationPayload): Promise<void> {
  // TODO: call Supabase Edge Function or external notification service
  // Example:
  //   await supabase.functions.invoke("send-notification", { body: payload });
  if (import.meta.env.DEV) {
    console.debug("[Notifications]", payload.event, payload);
  }
}

// ── Convenience helpers used at booking creation/cancellation ────────────────

export async function notifyBookingConfirmed(
  userId: string,
  data: BookingEventData,
): Promise<void> {
  await dispatchNotification(buildBookingConfirmedPayload(userId, data));
}

export async function notifyBookingCancelled(
  userId: string,
  data: BookingEventData,
): Promise<void> {
  await dispatchNotification(buildBookingCancelledPayload(userId, data));
}

export async function notifyUpcomingBooking(
  userId: string,
  data: BookingEventData,
  minutesBefore?: number,
): Promise<void> {
  await dispatchNotification(buildBookingReminderPayload(userId, data, minutesBefore));
}
