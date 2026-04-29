export const WORKING_START = "09:00";
export const WORKING_END = "18:00";
export const WORKING_END_EXTENDED = "18:30";
export const LUNCH_START = "13:00";
export const LUNCH_END = "14:00";
export const SLOT_MINUTES = 45;

export const DEPARTMENTS = [
  "TECH-FRONTEND",
  "TECH-BACKEND",
  "APTITUDE",
  "ENGLISH",
  "MATH",
  "DSA",
  "GEN AI",
  "OTHERS",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

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
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
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
  const rounded = Math.min(
    Math.ceil(mins / 15) * 15,
    timeToMinutes(WORKING_END_EXTENDED) - SLOT_MINUTES,
  );
  return minutesToTime(Math.max(rounded, timeToMinutes(WORKING_START)));
}

// Start time slots: 09:00 – 17:45 (last valid start for 1 candidate ending by 18:30)
export function generateTimeSlots(): string[] {
  const slots: string[] = [];
  const maxStart = timeToMinutes(WORKING_END_EXTENDED) - SLOT_MINUTES;
  for (let m = timeToMinutes(WORKING_START); m <= maxStart; m += 15) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

// End time slots relative to a given start time, up to 18:30
export function generateEndTimeSlots(startTime: string): string[] {
  const slots: string[] = [];
  for (let m = timeToMinutes(startTime) + 15; m <= timeToMinutes(WORKING_END_EXTENDED); m += 15) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

export function formatTime(t: string): string {
  return t.slice(0, 5);
}

export function overlapsLunch(startTime: string, endTime: string): boolean {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  const ls = timeToMinutes(LUNCH_START);
  const le = timeToMinutes(LUNCH_END);
  return s < le && e > ls;
}

export function getSuggestedSlotAroundLunch(
  candidateCount: number,
): { beforeLunch: string | null; afterLunch: string } {
  const duration = candidateCount * SLOT_MINUTES;
  const lunchStart = timeToMinutes(LUNCH_START);
  const workStart = timeToMinutes(WORKING_START);

  // Latest start time that allows booking to finish by lunch
  const latestBeforeLunch = lunchStart - duration;
  const snappedBefore = Math.floor(latestBeforeLunch / 15) * 15;
  const beforeLunch =
    snappedBefore >= workStart ? minutesToShort(snappedBefore) : null;

  return { beforeLunch, afterLunch: LUNCH_END };
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
  const end = timeToMinutes(WORKING_END_EXTENDED);
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

export function formatTime12h(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}
