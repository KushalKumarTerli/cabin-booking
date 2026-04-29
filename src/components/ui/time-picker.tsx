import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Clock, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const HOURS = ["01","02","03","04","05","06","07","08","09","10","11","12"];
const MINUTES = ["00","15","30","45"];
const PERIODS = ["AM","PM"] as const;
type Period = typeof PERIODS[number];

function to24h(h: number, period: Period): number {
  if (period === "AM") return h === 12 ? 0 : h;
  return h === 12 ? 12 : h + 12;
}

function to12h(h24: number): { hour: number; period: Period } {
  return { period: h24 < 12 ? "AM" : "PM", hour: h24 % 12 || 12 };
}

// Snap a raw minute value to the nearest valid slot minute
function snapMinute(rawMin: number): string {
  return MINUTES.reduce((best, curr) =>
    Math.abs(parseInt(curr) - rawMin) < Math.abs(parseInt(best) - rawMin) ? curr : best
  );
}

export interface TimePickerProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
  highlighted?: boolean;
}

export function TimePicker({ value, onChange, disabled, className, highlighted }: TimePickerProps) {
  const [open, setOpen] = useState(false);

  const h24 = parseInt(value.split(":")[0], 10) || 9;
  const rawMin = parseInt(value.split(":")[1], 10) || 0;
  const { hour, period } = to12h(h24);
  const minute = snapMinute(rawMin);

  const emit = (h: number, m: string, p: Period) => {
    const out24 = to24h(h, p);
    onChange(`${String(out24).padStart(2, "0")}:${m}:00`);
  };

  const hourStr = String(hour).padStart(2, "0");
  const display = `${hourStr}:${minute} ${period}`;

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-start gap-2 font-normal text-sm",
            highlighted && "border-sky-400 ring-1 ring-sky-300",
            className,
          )}
        >
          <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className={cn("font-medium", highlighted ? "text-sky-700" : "text-slate-700")}>
            {display}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4 shadow-lg" align="start" sideOffset={4}>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
          Select time
        </p>
        <div className="flex items-start gap-2">
          <WheelColumn
            label="Hour"
            items={HOURS}
            selected={hourStr}
            onSelect={(h) => emit(parseInt(h), minute, period)}
          />
          <div className="self-center mt-5 text-slate-300 text-xl font-light select-none pb-1">:</div>
          <WheelColumn
            label="Min"
            items={MINUTES}
            selected={minute}
            onSelect={(m) => emit(hour, m, period)}
          />
          <div className="flex flex-col gap-1.5 self-center mt-5 pl-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => emit(hour, minute, p)}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded-md transition-colors border",
                  p === period
                    ? "bg-sky-50 text-sky-700 border-sky-200"
                    : "text-slate-400 border-transparent hover:bg-slate-50 hover:text-slate-600",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 pt-3 border-t">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full h-7 text-xs font-semibold rounded-md bg-sky-600 hover:bg-sky-700 text-white transition-colors"
          >
            Done
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function WheelColumn({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string;
  items: string[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  const idx = items.indexOf(selected);
  const prev = idx > 0 ? items[idx - 1] : null;
  const next = idx < items.length - 1 ? items[idx + 1] : null;

  const goUp = () => prev && onSelect(prev);
  const goDown = () => next && onSelect(next);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.deltaY > 0) goDown();
    else goUp();
  };

  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
        {label}
      </span>

      <button
        type="button"
        onClick={goUp}
        disabled={!prev}
        className="h-6 w-9 flex items-center justify-center text-slate-300 hover:text-slate-500 disabled:opacity-0 transition-colors rounded"
        tabIndex={-1}
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>

      <div className="flex flex-col items-center" onWheel={handleWheel}>
        <button
          type="button"
          onClick={goUp}
          disabled={!prev}
          className="h-7 w-12 flex items-center justify-center text-slate-300 text-sm select-none hover:text-slate-400 disabled:cursor-default transition-colors rounded"
          tabIndex={-1}
        >
          {prev ?? ""}
        </button>

        <div className="h-10 w-12 flex items-center justify-center bg-sky-50 border border-sky-200 rounded-lg text-sky-800 font-bold text-lg select-none">
          {selected}
        </div>

        <button
          type="button"
          onClick={goDown}
          disabled={!next}
          className="h-7 w-12 flex items-center justify-center text-slate-300 text-sm select-none hover:text-slate-400 disabled:cursor-default transition-colors rounded"
          tabIndex={-1}
        >
          {next ?? ""}
        </button>
      </div>

      <button
        type="button"
        onClick={goDown}
        disabled={!next}
        className="h-6 w-9 flex items-center justify-center text-slate-300 hover:text-slate-500 disabled:opacity-0 transition-colors rounded"
        tabIndex={-1}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
