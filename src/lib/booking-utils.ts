export const WORKING_START = "09:00";
export const WORKING_END = "19:00";
export const WORKING_END_EXTENDED = "19:00";
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

// Start time slots: 09:00 – 18:15 (last valid start for 1 candidate ending by 19:00)
export function generateTimeSlots(): string[] {
  const slots: string[] = [];
  const maxStart = timeToMinutes(WORKING_END_EXTENDED) - SLOT_MINUTES;
  for (let m = timeToMinutes(WORKING_START); m <= maxStart; m += 15) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

// End time slots relative to a given start time, up to 19:00
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

// ── Timeline utilities ───────────────────────────────────────────────────────

export interface TimelineBooking {
  start_time: string;
  end_time: string;
  status: string;
  user_id?: string;
  candidate_count?: number;
}

export interface TimelineSlot {
  type: "available" | "booked";
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  userId?: string;
  candidateCount?: number;
}

/**
 * Splits a cabin's working day (09:00–WORKING_END_EXTENDED) into a sorted
 * sequence of available and booked slots based on its active bookings.
 */
export function getCabinTimeline(bookings: TimelineBooking[]): TimelineSlot[] {
  const active = bookings
    .filter((b) => b.status === "active")
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

  const slots: TimelineSlot[] = [];
  let cursor = timeToMinutes(WORKING_START);
  const workEnd = timeToMinutes(WORKING_END_EXTENDED);

  for (const bk of active) {
    const bStart = timeToMinutes(bk.start_time);
    const bEnd = Math.min(timeToMinutes(bk.end_time), workEnd);
    if (bEnd <= cursor) continue; // entirely outside / already consumed

    if (bStart > cursor) {
      slots.push({ type: "available", start: minutesToShort(cursor), end: minutesToShort(bStart) });
    }
    slots.push({
      type: "booked",
      start: minutesToShort(Math.max(bStart, cursor)),
      end: minutesToShort(bEnd),
      userId: bk.user_id,
      candidateCount: bk.candidate_count,
    });
    cursor = bEnd;
  }

  if (cursor < workEnd) {
    slots.push({ type: "available", start: minutesToShort(cursor), end: minutesToShort(workEnd) });
  }

  return slots;
}

/**
 * Like getCabinTimeline but only returns the current slot (if still running)
 * and all future slots — completely past slots (endMin <= nowMin) are dropped.
 * Use this for today's real-time view.
 */
export function getUpcomingTimeline(
  bookings: TimelineBooking[],
  nowMin: number,
): TimelineSlot[] {
  return getCabinTimeline(bookings).filter(
    (slot) => timeToMinutes(slot.end) > nowMin,
  );
}

/**
 * Returns the earliest minute (as an integer) at which the cabin is free,
 * starting from nowMin clamped to WORKING_START.
 *
 * - Cabin free right now  → returns nowMin (caller shows "Now")
 * - Cabin currently booked → returns the end of that booking (exact time)
 * - No working time left  → returns null (caller shows "Tomorrow 9:00 AM")
 *
 * The returned value is always either nowMin or a booking's exact end_time,
 * so it is never a random mid-slot value.
 */
export function getNextAvailableSlot(
  bookings: TimelineBooking[],
  nowMin: number,
): number | null {
  const workStart = timeToMinutes(WORKING_START);
  const workEnd = timeToMinutes(WORKING_END_EXTENDED);
  let cursor = Math.max(nowMin, workStart);
  if (cursor >= workEnd) return null;

  const active = bookings
    .filter((b) => b.status === "active")
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

  for (const bk of active) {
    const bStart = timeToMinutes(bk.start_time);
    const bEnd = timeToMinutes(bk.end_time);
    if (cursor < bStart) return cursor; // gap before this booking — free now
    if (cursor < bEnd) cursor = bEnd;   // inside booking — skip to its end
  }

  return cursor < workEnd ? cursor : null;
}

/**
 * Returns true if `managerId` already has an active booking on any cabin
 * that overlaps [startTime, endTime) on the given booking list.
 */
export function hasManagerConflict(
  allBookings: Array<{ user_id: string; start_time: string; end_time: string; status: string }>,
  managerId: string,
  startTime: string,
  endTime: string,
): boolean {
  const reqStart = timeToMinutes(startTime);
  const reqEnd = timeToMinutes(endTime);
  return allBookings
    .filter((b) => b.user_id === managerId && b.status === "active")
    .some((b) => {
      const bs = timeToMinutes(b.start_time);
      const be = timeToMinutes(b.end_time);
      return reqStart < be && reqEnd > bs;
    });
}
