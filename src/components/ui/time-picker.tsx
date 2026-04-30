import { forwardRef, useEffect, useRef, useState } from "react";
import { Clock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

type Period = "AM" | "PM";

/** Height of each scrollable item — must match the inline style on each button. */
const ITEM_H = 36;
const HOURS: number[] = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // 12-hour order
const MINUTES: number[] = Array.from({ length: 60 }, (_, i) => i);

// ── Helpers ───────────────────────────────────────────────────────────────────

function to24h(h: number, p: Period): number {
  if (p === "AM") return h === 12 ? 0 : h;
  return h === 12 ? 12 : h + 12;
}

function to12h(h24: number): { hour: number; period: Period } {
  return { period: h24 < 12 ? "AM" : "PM", hour: h24 % 12 || 12 };
}

/** Accepts "HH:MM", "HH:MM:SS", or any leading numeric string. */
function parseTimeStr(v: string): { hour: number; minute: number; period: Period } {
  const parts = v.split(":");
  const h24 = parseInt(parts[0] ?? "9", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  const { hour, period } = to12h(isNaN(h24) ? 9 : Math.min(23, Math.max(0, h24)));
  return { hour, minute: isNaN(m) ? 0 : Math.min(59, Math.max(0, m)), period };
}

/** Emits "HH:MM:SS" 24-hour format — consistent with the rest of the codebase. */
function buildTimeStr(h: number, m: number, p: Period): string {
  const h24 = to24h(h, p);
  return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/** Total minutes since midnight from a time string. */
function strToMin(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TimePickerProps {
  /** "HH:MM:SS" or "HH:MM" in 24-hour format. */
  value: string;
  onChange: (v: string) => void;
  /** Lower bound — "HH:MM:SS". Disables times before this. */
  minTime?: string;
  /** Upper bound — "HH:MM:SS". Disables times after this. */
  maxTime?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Adds a coloured ring to signal the value was manually overridden. */
  highlighted?: boolean;
}

// ── TimePicker ────────────────────────────────────────────────────────────────

export function TimePicker({
  value,
  onChange,
  minTime,
  maxTime,
  disabled,
  placeholder = "Select time",
  className,
  highlighted,
}: TimePickerProps) {
  const parsed = parseTimeStr(value);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [period, setPeriod] = useState<Period>(parsed.period);
  const [open, setOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const hourColRef = useRef<HTMLDivElement>(null);
  const minColRef = useRef<HTMLDivElement>(null);

  // ── External sync (e.g. "Reset to auto", lunch suggestion) ───────────────
  useEffect(() => {
    if (open) return; // don't clobber while user is picking
    const { hour: h, minute: m, period: p } = parseTimeStr(value);
    setHour(h);
    setMinute(m);
    setPeriod(p);
  }, [value, open]);

  // ── Click-outside to close ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Scroll selected item into view when dropdown opens ───────────────────
  useEffect(() => {
    if (!open) return;
    const scrollToIdx = (el: HTMLDivElement | null, idx: number) => {
      if (!el || idx < 0) return;
      // Centre the selected row in the visible area
      el.scrollTop = Math.max(0, idx * ITEM_H - el.clientHeight / 2 + ITEM_H / 2);
    };
    const t = setTimeout(() => {
      scrollToIdx(hourColRef.current, HOURS.indexOf(hour));
      scrollToIdx(minColRef.current, minute);
    }, 16); // one frame so the DOM is painted
    return () => clearTimeout(t);
  }, [open]); // intentionally not re-running on hour/minute change

  // ── Validity bounds ───────────────────────────────────────────────────────
  const minMin = minTime ? strToMin(minTime) : 0;
  const maxMin = maxTime ? strToMin(maxTime) : 23 * 60 + 59;

  /**
   * An hour is valid if at least one minute in that hour falls within
   * [minMin, maxMin]. This drives whether the hour button is disabled.
   */
  const isHourValid = (h: number, p: Period): boolean => {
    const h24 = to24h(h, p);
    const startOfHour = h24 * 60;
    const endOfHour = h24 * 60 + 59;
    return startOfHour <= maxMin && endOfHour >= minMin;
  };

  const isMinuteValid = (m: number, h: number, p: Period): boolean => {
    const total = to24h(h, p) * 60 + m;
    return total >= minMin && total <= maxMin;
  };

  const isPeriodValid = (p: Period): boolean => HOURS.some((h) => isHourValid(h, p));

  // ── Emit ──────────────────────────────────────────────────────────────────
  const emit = (h: number, m: number, p: Period) => onChange(buildTimeStr(h, m, p));

  /**
   * Clamp minute to the nearest valid value, preferring lower values.
   * Used when changing hour or period would push the current minute out of range.
   */
  const clampMinute = (m: number, h: number, p: Period): number => {
    if (isMinuteValid(m, h, p)) return m;
    for (let i = m - 1; i >= 0; i--) if (isMinuteValid(i, h, p)) return i;
    for (let i = m + 1; i <= 59; i++) if (isMinuteValid(i, h, p)) return i;
    return m;
  };

  // ── Handlers ─────────────────────────────────────────────────────────────
  const selectHour = (h: number) => {
    const m = clampMinute(minute, h, period);
    setHour(h);
    setMinute(m);
    emit(h, m, period);
  };

  const selectMinute = (m: number) => {
    setMinute(m);
    emit(hour, m, period);
  };

  const selectPeriod = (p: Period) => {
    let h = hour;
    // If current hour is invalid for the new period, jump to first valid hour
    if (!isHourValid(hour, p)) {
      h = HOURS.find((hh) => isHourValid(hh, p)) ?? hour;
      setHour(h);
    }
    const m = clampMinute(minute, h, p);
    setMinute(m);
    setPeriod(p);
    emit(h, m, p);
  };

  // ── Display ───────────────────────────────────────────────────────────────
  const displayLabel = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;

  return (
    <div ref={rootRef} className={cn("relative", className)}>

      {/* ── Trigger button ─────────────────────────────────────────────────── */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm",
          "transition-colors hover:bg-muted/50",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          highlighted && "border-sky-400 ring-1 ring-sky-300",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-left font-medium tabular-nums">
          {value ? displayLabel : <span className="text-muted-foreground font-normal">{placeholder}</span>}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {/* ── Dropdown panel ─────────────────────────────────────────────────── */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[210px] overflow-hidden rounded-xl border border-border bg-popover shadow-xl">

          {/* 3-column picker */}
          <div className="flex divide-x divide-border">

            {/* Hours */}
            <PickerColumn
              ref={hourColRef}
              header="HR"
              items={HOURS.map((h) => ({
                key: h,
                label: String(h).padStart(2, "0"),
                selected: h === hour,
                disabled: !isHourValid(h, period),
              }))}
              onSelect={selectHour}
            />

            {/* Minutes */}
            <PickerColumn
              ref={minColRef}
              header="MIN"
              items={MINUTES.map((m) => ({
                key: m,
                label: String(m).padStart(2, "0"),
                selected: m === minute,
                disabled: !isMinuteValid(m, hour, period),
              }))}
              onSelect={selectMinute}
            />

            {/* AM / PM */}
            <div className="flex w-[68px] shrink-0 flex-col">
              <div className="shrink-0 border-b border-border bg-muted/40 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                AM/PM
              </div>
              <div className="flex flex-1 flex-col justify-center gap-2 p-2">
                {(["AM", "PM"] as Period[]).map((p) => {
                  const valid = isPeriodValid(p);
                  const active = p === period;
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={!valid}
                      onClick={() => selectPeriod(p)}
                      className={cn(
                        "w-full rounded-lg py-2.5 text-sm font-bold transition-all",
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-foreground hover:bg-muted",
                        !valid && "pointer-events-none opacity-25",
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Done button */}
          <div className="border-t border-border bg-muted/20 px-3 py-2 text-center">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-primary hover:underline focus-visible:outline-none"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PickerColumn ──────────────────────────────────────────────────────────────

interface ColItem {
  key: number;
  label: string;
  selected: boolean;
  disabled: boolean;
}

const PickerColumn = forwardRef<
  HTMLDivElement,
  { header: string; items: ColItem[]; onSelect: (v: number) => void }
>(({ header, items, onSelect }, ref) => (
  <div className="flex min-w-0 flex-1 flex-col">
    {/* Column header */}
    <div className="shrink-0 border-b border-border bg-muted/40 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {header}
    </div>

    {/* Scrollable item list — shows 6 items at a time */}
    <div
      ref={ref}
      className="overflow-y-auto scroll-smooth"
      style={{ maxHeight: `${ITEM_H * 6}px` }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          disabled={item.disabled}
          onClick={() => onSelect(item.key)}
          style={{ height: `${ITEM_H}px` }}
          className={cn(
            "w-full font-mono text-sm transition-colors",
            item.selected
              ? "bg-primary text-primary-foreground font-semibold"
              : "text-foreground hover:bg-muted",
            item.disabled && "pointer-events-none opacity-20 text-muted-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  </div>
));
PickerColumn.displayName = "PickerColumn";
