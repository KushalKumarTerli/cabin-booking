import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  todayISO,
  tomorrowISO,
  formatTime,
  findNextFreeSlot,
  getCurrentBooking,
  WORKING_START,
} from "@/lib/booking-utils";
import { Building2, ArrowRight, Calendar, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

interface CabinRow {
  id: string;
  name: string;
  floor: string;
  wing: string | null;
  capacity: number;
  is_active: boolean;
}

interface BookingRow {
  id: string;
  cabin_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  candidate_count: number;
  status: "active" | "cancelled" | "overridden";
  profiles: { full_name: string } | null;
}

function Dashboard() {
  const [day, setDay] = useState<"today" | "tomorrow">("today");
  const date = day === "today" ? todayISO() : tomorrowISO();

  const cabinsQ = useQuery({
    queryKey: ["cabins", "active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cabins").select("*").eq("is_active", true).order("floor").order("name");
      if (error) throw error;
      return data as CabinRow[];
    },
  });

  const bookingsQ = useQuery({
    queryKey: ["bookings", "by-date", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, cabin_id, user_id, start_time, end_time, candidate_count, status, profiles(full_name)")
        .eq("booking_date", date)
        .eq("status", "active")
        .order("start_time");
      if (error) throw error;
      return data as unknown as BookingRow[];
    },
    refetchInterval: 30_000,
  });

  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cabin availability</h1>
          <p className="text-sm text-muted-foreground">Live status for {day === "today" ? "today" : "tomorrow"}</p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={day} onValueChange={(v) => setDay(v as "today" | "tomorrow")}>
            <TabsList>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="tomorrow">Tomorrow</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button asChild>
            <Link to="/book">Book a cabin</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cabinsQ.data?.map((cabin) => {
          const cBookings = (bookingsQ.data ?? []).filter((b) => b.cabin_id === cabin.id);
          const current = day === "today" ? getCurrentBooking(cBookings, nowTime) : null;
          const isOccupied = !!current;
          const next = findNextFreeSlot(cBookings, day === "today" ? nowTime : `${WORKING_START}:00`);
          return (
            <Card key={cabin.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {cabin.name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {cabin.floor}{cabin.wing ? ` · ${cabin.wing}` : ""} · seats {cabin.capacity}
                    </p>
                  </div>
                  {isOccupied ? (
                    <Badge className="bg-warning text-warning-foreground hover:bg-warning">Occupied</Badge>
                  ) : (
                    <Badge className="bg-success text-success-foreground hover:bg-success">Available</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {isOccupied && current ? (
                  <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                    <div className="font-medium truncate">{current.profiles?.full_name ?? "Booked"}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> until {formatTime(current.end_time)} · {current.candidate_count} candidate(s)
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md bg-success/10 p-3 text-sm text-success-foreground/80">
                    <div className="text-xs uppercase tracking-wide text-success font-medium">Free now</div>
                    <div className="text-foreground mt-0.5">Ready to book</div>
                  </div>
                )}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" /> Next free slot: {next ?? "End of day"}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link to="/cabins/$cabinId" params={{ cabinId: cabin.id }}>
                      Timeline
                    </Link>
                  </Button>
                  <Button asChild size="sm" className="flex-1">
                    <Link
                      to="/book"
                      search={{ cabinId: cabin.id, date, start: next ?? undefined }}
                    >
                      Book <ArrowRight className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}