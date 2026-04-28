import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  todayISO,
  tomorrowISO,
  timeToMinutes,
  formatTime,
  WORKING_START,
  WORKING_END,
  minutesToShort,
} from "@/lib/booking-utils";

export const Route = createFileRoute("/_authenticated/cabins/$cabinId")({
  component: CabinDetail,
});

interface BookingRow {
  id: string;
  start_time: string;
  end_time: string;
  candidate_count: number;
  status: string;
  profiles: { full_name: string } | null;
}

function CabinDetail() {
  const { cabinId } = Route.useParams();
  const [day, setDay] = useState<"today" | "tomorrow">("today");
  const date = day === "today" ? todayISO() : tomorrowISO();

  const cabinQ = useQuery({
    queryKey: ["cabin", cabinId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cabins").select("*").eq("id", cabinId).single();
      if (error) throw error;
      return data;
    },
  });

  const bookingsQ = useQuery({
    queryKey: ["cabin-bookings", cabinId, date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, start_time, end_time, candidate_count, status, profiles(full_name)")
        .eq("cabin_id", cabinId)
        .eq("booking_date", date)
        .eq("status", "active")
        .order("start_time");
      if (error) throw error;
      return data as unknown as BookingRow[];
    },
  });

  const dayStart = timeToMinutes(WORKING_START);
  const dayEnd = timeToMinutes(WORKING_END);
  const totalMin = dayEnd - dayStart;

  const bookings = bookingsQ.data ?? [];

  // build gaps
  const gaps: { start: number; end: number }[] = [];
  let cursor = dayStart;
  for (const b of bookings) {
    const s = timeToMinutes(b.start_time);
    const e = timeToMinutes(b.end_time);
    if (s > cursor) gaps.push({ start: cursor, end: s });
    cursor = Math.max(cursor, e);
  }
  if (cursor < dayEnd) gaps.push({ start: cursor, end: dayEnd });

  const hours: number[] = [];
  for (let h = Math.floor(dayStart / 60); h <= Math.floor(dayEnd / 60); h++) hours.push(h);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Button asChild variant="ghost" size="sm">
        <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
      </Button>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{cabinQ.data?.name ?? "Cabin"}</h1>
          <p className="text-sm text-muted-foreground">
            {cabinQ.data?.floor}{cabinQ.data?.wing ? ` · ${cabinQ.data.wing}` : ""} · seats {cabinQ.data?.capacity}
          </p>
        </div>
        <Tabs value={day} onValueChange={(v) => setDay(v as "today" | "tomorrow")}>
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="tomorrow">Tomorrow</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Day timeline · {WORKING_START} – {WORKING_END}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative h-32 rounded-md border bg-muted/30">
            {bookings.map((b) => {
              const s = timeToMinutes(b.start_time);
              const e = timeToMinutes(b.end_time);
              const left = ((s - dayStart) / totalMin) * 100;
              const width = ((e - s) / totalMin) * 100;
              return (
                <div
                  key={b.id}
                  className="absolute top-2 bottom-2 rounded-md bg-primary text-primary-foreground p-2 text-xs overflow-hidden"
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${b.profiles?.full_name ?? ""} · ${formatTime(b.start_time)}-${formatTime(b.end_time)}`}
                >
                  <div className="font-semibold truncate">{b.profiles?.full_name ?? "Booked"}</div>
                  <div className="opacity-90 truncate">{formatTime(b.start_time)}–{formatTime(b.end_time)} · {b.candidate_count}c</div>
                </div>
              );
            })}
            {gaps.map((g, i) => {
              const left = ((g.start - dayStart) / totalMin) * 100;
              const width = ((g.end - g.start) / totalMin) * 100;
              return (
                <Link
                  key={i}
                  to="/book"
                  search={{ cabinId, date, start: minutesToShort(g.start) }}
                  className="absolute top-2 bottom-2 rounded-md border-2 border-dashed border-success/50 bg-success/5 hover:bg-success/15 transition-colors flex items-center justify-center text-xs text-success font-medium"
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`Book ${minutesToShort(g.start)}-${minutesToShort(g.end)}`}
                >
                  + Free
                </Link>
              );
            })}
          </div>
          <div className="relative h-5 mt-1">
            {hours.map((h) => {
              const left = ((h * 60 - dayStart) / totalMin) * 100;
              return (
                <span
                  key={h}
                  className="absolute -translate-x-1/2 text-[10px] text-muted-foreground"
                  style={{ left: `${left}%` }}
                >
                  {String(h).padStart(2, "0")}:00
                </span>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Bookings</CardTitle></CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings for this day.</p>
          ) : (
            <ul className="divide-y">
              {bookings.map((b) => (
                <li key={b.id} className="py-2 flex items-center justify-between text-sm">
                  <span className="font-medium">{b.profiles?.full_name ?? "—"}</span>
                  <span className="text-muted-foreground">
                    {formatTime(b.start_time)} – {formatTime(b.end_time)} · {b.candidate_count} candidate(s)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}