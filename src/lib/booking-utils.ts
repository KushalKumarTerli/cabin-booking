export const WORKING_START = "09:00";
export const WORKING_END = "18:00";
export const SLOT_MINUTES = 45;

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

export function minutesToShort(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function computeEndTime(startTime: string, candidateCount: number): string {
  return minutesToTime(timeToMinutes(startTime) + candidateCount * SLOT_MINUTES);
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return isoDate(new Date());
}

export function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}

export function nowRoundedTo15(): string {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const rounded = Math.ceil(mins / 15) * 15;
  return minutesToTime(rounded);
}

export function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let m = timeToMinutes(WORKING_START); m <= timeToMinutes(WORKING_END) - 15; m += 15) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

export function formatTime(t: string): string {
  // "HH:MM:SS" or "HH:MM" -> "HH:MM"
  return t.slice(0, 5);
}

export interface BookingLike {
  start_time: string;
  end_time: string;
  status: string;
}

export function findNextFreeSlot(
  bookings: BookingLike[],
  fromTime: string,
): string | null {
  const active = bookings
    .filter((b) => b.status === "active")
    .map((b) => ({ s: timeToMinutes(b.start_time), e: timeToMinutes(b.end_time) }))
    .sort((a, b) => a.s - b.s);
  let cursor = Math.max(timeToMinutes(fromTime), timeToMinutes(WORKING_START));
  const end = timeToMinutes(WORKING_END);
  for (const b of active) {
    if (cursor + 15 <= b.s) return minutesToShort(cursor);
    cursor = Math.max(cursor, b.e);
  }
  if (cursor + 15 <= end) return minutesToShort(cursor);
  return null;
}

export function getCurrentBooking<T extends BookingLike>(bookings: T[], nowTime: string): T | null {
  const n = timeToMinutes(nowTime);
  return (
    bookings.find(
      (b) => b.status === "active" && timeToMinutes(b.start_time) <= n && n < timeToMinutes(b.end_time),
    ) ?? null
  );
}