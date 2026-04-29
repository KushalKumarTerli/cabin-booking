import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  todayISO,
  tomorrowISO,
  formatTime12h,
  formatDuration,
  findNextFreeSlot,
  getCurrentBooking,
  WORKING_START,
  timeToMinutes,
} from "@/lib/booking-utils";
import { Building2, ArrowRight, Calendar, Clock, Users, Filter, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

interface CabinRow {
  id: string;
  name: string;
  floor: string;
  wing: string | null;
  is_active: boolean;
}

interface BookingRow {
  id: string;
  cabin_id: string;
  start_time: string;
  end_time: string;
  candidate_count: number;
  status: "active" | "cancelled" | "overridden";
  profiles: { full_name: string; department: string } | null;
}

const FLOOR_ORDER = [
  "Ground Floor",
  "2nd Floor",
  "4th Floor",
  "4th Floor West Wing",
  "4th Floor East Wing",
];

function getFloorKey(cabin: CabinRow): string {
  if (cabin.wing) return `${cabin.floor} ${cabin.wing}`;
  return cabin.floor;
}

function floorSortIndex(key: string): number {
  const idx = FLOOR_ORDER.findIndex(
    (f) => key === f || key.startsWith(f.split(" ")[0]),
  );
  return idx === -1 ? 999 : idx;
}

function Dashboard() {
  const [day, setDay] = useState<"today" | "tomorrow">("today");
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "in_use" | "booked">("all");
  const [floorFilter, setFloorFilter] = useState("all");
  const [nextSoonOnly, setNextSoonOnly] = useState(false);

  // Reactive clock — updates every 60 s so "In Use" status stays accurate
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const date = day === "today" ? todayISO() : tomorrowISO();
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const cabinsQ = useQuery({
    queryKey: ["cabins", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cabins")
        .select("id, name, floor, wing, is_active")
        .eq("is_active", true)
        .order("floor")
        .order("name");
      if (error) throw error;
      return data as CabinRow[];
    },
    staleTime: 30_000,
  });

  const bookingsQ = useQuery({
    queryKey: ["bookings", "by-date", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, cabin_id, start_time, end_time, candidate_count, status, profiles(full_name, department)")
        .eq("booking_date", date)
        .eq("status", "active")
        .order("start_time");
      if (error) throw error;
      return data as unknown as BookingRow[];
    },
    staleTime: 0,
    refetchInterval: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const allFloors = useMemo(() => {
    const seen = new Set<string>();
    (cabinsQ.data ?? []).forEach((c) => seen.add(getFloorKey(c)));
    return Array.from(seen).sort((a, b) => floorSortIndex(a) - floorSortIndex(b));
  }, [cabinsQ.data]);

  const filteredCabins = useMemo(() => {
    const cabins = cabinsQ.data ?? [];
    const bookings = bookingsQ.data ?? [];
    return cabins.filter((cabin) => {
      const cBkgs = bookings.filter((b) => b.cabin_id === cabin.id);
      const current = day === "today" ? getCurrentBooking(cBkgs, nowTime) : null;
      const isOccupied = !!current;
      const hasAnyBooking = cBkgs.length > 0;

      if (floorFilter !== "all" && getFloorKey(cabin) !== floorFilter) return false;
      if (statusFilter === "available" && isOccupied) return false;
      if (statusFilter === "in_use" && !isOccupied) return false;
      if (statusFilter === "booked" && !hasAnyBooking) return false;

      if (nextSoonOnly) {
        const next = findNextFreeSlot(cBkgs, day === "today" ? nowTime : `${WORKING_START}:00`);
        if (!next) return false;
        if (day !== "today") return true;
        if (timeToMinutes(next) - nowMin > 30) return false;
      }
      return true;
    });
  }, [cabinsQ.data, bookingsQ.data, floorFilter, statusFilter, nextSoonOnly, day, nowTime, nowMin]);

  const groupedCabins = useMemo(() => {
    const map = new Map<string, CabinRow[]>();
    filteredCabins.forEach((c) => {
      const key = getFloorKey(c);
      map.set(key, [...(map.get(key) ?? []), c]);
    });
    return Array.from(map.entries()).sort(([a], [b]) => floorSortIndex(a) - floorSortIndex(b));
  }, [filteredCabins]);

  const hasFilters = statusFilter !== "all" || floorFilter !== "all" || nextSoonOnly;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cabin Availability</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            Live status · {day === "today" ? todayISO() : tomorrowISO()} · updates every 15s
            {bookingsQ.isFetching && (
              <RefreshCw className="h-3 w-3 animate-spin text-primary" />
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={day} onValueChange={(v) => setDay(v as "today" | "tomorrow")}>
            <TabsList>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="tomorrow">Tomorrow</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button asChild>
            <Link to="/book">Book a Cabin</Link>
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Filters</span>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="h-8 w-36 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="in_use">In Use</SelectItem>
                  <SelectItem value="booked">Has Bookings</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Floor</Label>
              <Select value={floorFilter} onValueChange={setFloorFilter}>
                <SelectTrigger className="h-8 w-52 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Floors</SelectItem>
                  {allFloors.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {day === "today" && (
              <div className="flex items-center gap-2">
                <Switch
                  id="soon"
                  checked={nextSoonOnly}
                  onCheckedChange={setNextSoonOnly}
                />
                <Label htmlFor="soon" className="text-sm cursor-pointer whitespace-nowrap">
                  Next Available ≤ 30 min
                </Label>
              </div>
            )}
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setStatusFilter("all"); setFloorFilter("all"); setNextSoonOnly(false); }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Floor-wise cabin groups */}
      {groupedCabins.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Building2 className="h-8 w-8 opacity-40" />
          <p className="text-sm">No cabins match the current filters.</p>
          {hasFilters && (
            <Button variant="link" size="sm" onClick={() => { setStatusFilter("all"); setFloorFilter("all"); setNextSoonOnly(false); }}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {groupedCabins.map(([floorKey, cabins]) => (
            <section key={floorKey}>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <div className="w-1 h-6 rounded-full bg-primary" />
                  <h2 className="text-base font-bold text-foreground tracking-tight">
                    {floorKey}
                  </h2>
                </div>
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {cabins.length} cabin{cabins.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {cabins.map((cabin) => {
                  const cBkgs = (bookingsQ.data ?? []).filter((b) => b.cabin_id === cabin.id);
                  const current = day === "today" ? getCurrentBooking(cBkgs, nowTime) : null;
                  const isOccupied = !!current;
                  const nextSlot = findNextFreeSlot(cBkgs, day === "today" ? nowTime : `${WORKING_START}:00`);
                  return (
                    <CabinCard
                      key={cabin.id}
                      cabin={cabin}
                      current={current}
                      isOccupied={isOccupied}
                      nextSlot={nextSlot}
                      date={date}
                      day={day}
                      nowTime={nowTime}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

interface CabinCardProps {
  cabin: CabinRow;
  current: BookingRow | null;
  isOccupied: boolean;
  nextSlot: string | null;
  date: string;
  day: "today" | "tomorrow";
  nowTime: string;
}

function CabinCard({ cabin, current, isOccupied, nextSlot, date, day }: CabinCardProps) {
  const durationMin = current
    ? timeToMinutes(current.end_time) - timeToMinutes(current.start_time)
    : 0;

  // Most accurate "next available at" — accounts for back-to-back bookings
  const nextAvailableAt = nextSlot
    ? formatTime12h(`${nextSlot}:00`)
    : current
      ? formatTime12h(current.end_time)
      : null;

  return (
    <Card className={`overflow-hidden transition-shadow hover:shadow-md ${isOccupied ? "" : "border-success/20"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{cabin.name}</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {cabin.floor}{cabin.wing ? ` · ${cabin.wing}` : ""}
            </p>
          </div>
          {isOccupied ? (
            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 shrink-0">
              In Use
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 shrink-0">
              Available
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isOccupied && current ? (
          <div className="rounded-md bg-orange-50 border border-orange-100 p-3 text-sm space-y-2">
            {/* Booked By */}
            <div>
              <div className="text-xs text-orange-500 uppercase tracking-wide font-medium mb-0.5">Booked By</div>
              <div className="font-semibold text-orange-900 truncate">{current.profiles?.full_name ?? "—"}</div>
              {current.profiles?.department && (
                <div className="text-xs text-orange-700 mt-0.5">{current.profiles.department}</div>
              )}
            </div>
            {/* Time + Duration */}
            <div className="pt-1.5 border-t border-orange-200 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-orange-700">
                <Clock className="h-3 w-3 shrink-0" />
                <span className="font-medium">{formatTime12h(current.start_time)}</span>
                <span className="text-orange-400">→</span>
                <span className="font-medium">{formatTime12h(current.end_time)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-orange-700">
                <Users className="h-3 w-3 shrink-0" />
                <span>{current.candidate_count} candidate(s) · {formatDuration(durationMin)}</span>
              </div>
            </div>
            {/* Next Available */}
            {nextAvailableAt && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-orange-800 pt-1.5 border-t border-orange-200">
                <Calendar className="h-3 w-3 shrink-0" />
                Next Available At: <span className="font-semibold">{nextAvailableAt}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md bg-green-50 border border-green-100 p-3 text-sm space-y-1">
            <div className="text-xs font-semibold text-green-700 uppercase tracking-wide">Free Now</div>
            <div className="flex items-center gap-1.5 text-xs text-green-700">
              <Calendar className="h-3 w-3 shrink-0" />
              Available: <span className="font-semibold">{day === "today" ? "Now" : "9:00 AM"}</span>
            </div>
          </div>
        )}


        <div className="flex gap-2 pt-1">
          <Button asChild size="sm" variant="outline" className="flex-1">
            <Link to="/cabins/$cabinId" params={{ cabinId: cabin.id }}>
              Timeline
            </Link>
          </Button>
          <Button asChild size="sm" className="flex-1">
            <Link to="/book" search={{ cabinId: cabin.id, date, start: nextSlot ?? undefined }}>
              Book <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
