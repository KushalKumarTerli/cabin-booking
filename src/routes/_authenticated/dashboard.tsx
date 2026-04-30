import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  getCabinTimeline,
  getUpcomingTimeline,
  getNextAvailableSlot,
  minutesToShort,
  WORKING_START,
  timeToMinutes,
  type TimelineSlot,
} from "@/lib/booking-utils";
import { Building2, ArrowRight, Filter, RefreshCw, Clock } from "lucide-react";

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
  user_id: string;
  start_time: string;
  end_time: string;
  candidate_count: number;
  status: "active" | "cancelled" | "overridden";
}

interface ProfileRow {
  id: string;
  full_name: string;
  department: string;
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
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "in_use" | "reserved">("all");
  const [floorFilter, setFloorFilter] = useState("all");
  const [nextSoonOnly, setNextSoonOnly] = useState(false);
  const qc = useQueryClient();

  // Reactive clock — updates every 30 s so "In Use" status stays accurate
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Supabase Realtime: instant update when any booking is created/cancelled/overridden
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-bookings-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        qc.invalidateQueries({ queryKey: ["bookings"], refetchType: "all" });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

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
        .select("id, cabin_id, user_id, start_time, end_time, candidate_count, status")
        .eq("booking_date", date)
        .eq("status", "active")
        .order("start_time");
      if (error) throw error;
      return data as BookingRow[];
    },
    staleTime: 0,
    refetchInterval: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const userIds = useMemo(
    () => [...new Set((bookingsQ.data ?? []).map((b) => b.user_id))].sort(),
    [bookingsQ.data],
  );

  const profilesQ = useQuery({
    queryKey: ["profiles", "by-ids", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, department")
        .in("id", userIds);
      if (error) throw error;
      return data as ProfileRow[];
    },
    staleTime: 60_000,
  });

  const profileMap = useMemo(() => {
    const map = new Map<string, ProfileRow>();
    (profilesQ.data ?? []).forEach((p) => map.set(p.id, p));
    return map;
  }, [profilesQ.data]);

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
      const upcomingBooking = current ? null : (
        cBkgs
          .filter((b) => day === "today" ? timeToMinutes(b.start_time) > nowMin : true)
          .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))[0] ?? null
      );
      const isReserved = !isOccupied && !!upcomingBooking;

      if (floorFilter !== "all" && getFloorKey(cabin) !== floorFilter) return false;
      if (statusFilter === "available" && (isOccupied || isReserved)) return false;
      if (statusFilter === "in_use" && !isOccupied) return false;
      if (statusFilter === "reserved" && !isReserved) return false;

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
                  <SelectItem value="reserved">Reserved</SelectItem>
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
                  return (
                    <CabinCard
                      key={cabin.id}
                      cabin={cabin}
                      cabinBookings={cBkgs}
                      date={date}
                      day={day}
                      nowTime={nowTime}
                      nowMin={nowMin}
                      profileMap={profileMap}
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
  cabinBookings: BookingRow[];
  date: string;
  day: "today" | "tomorrow";
  nowTime: string;
  nowMin: number;
  profileMap: Map<string, ProfileRow>;
}

function CabinCard({ cabin, cabinBookings, date, day, nowTime, nowMin, profileMap }: CabinCardProps) {
  const activeBookings = cabinBookings.filter((b) => b.status === "active");

  // Today: hide completely-past slots. Tomorrow: show the full working day.
  const timeline = day === "today"
    ? getUpcomingTimeline(activeBookings, nowMin)
    : getCabinTimeline(activeBookings);

  const current = day === "today" ? getCurrentBooking(activeBookings, nowTime) : null;
  const isOccupied = !!current;
  const hasUpcoming = !isOccupied && activeBookings.some((b) =>
    day === "today" ? timeToMinutes(b.start_time) > nowMin : true,
  );

  // nextAvailableMin: exact minute the cabin is free (booking end time or nowMin)
  const nextAvailableMin = getNextAvailableSlot(
    activeBookings,
    day === "today" ? nowMin : 0, // 0 → clamps to WORKING_START for tomorrow
  );
  const nextFreeLabel = (() => {
    if (nextAvailableMin === null) {
      return day === "today" ? "Tomorrow 9:00 AM" : "Fully booked";
    }
    if (day === "today" && nextAvailableMin <= nowMin) return "Now";
    return formatTime12h(minutesToShort(nextAvailableMin));
  })();

  // Slot for the Book button — must have ≥15 min remaining (findNextFreeSlot ensures this)
  const nextFreeFrom = day === "today" ? nowTime : `${WORKING_START}:00`;
  const nextSlotShort = findNextFreeSlot(activeBookings, nextFreeFrom);

  const statusBadge = isOccupied
    ? { label: "In Use", cls: "bg-orange-50 text-orange-700 border-orange-200" }
    : hasUpcoming
      ? { label: "Reserved", cls: "bg-amber-50 text-amber-700 border-amber-200" }
      : { label: "Available", cls: "bg-green-50 text-green-700 border-green-200" };

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{cabin.name}</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {cabin.floor}{cabin.wing ? ` · ${cabin.wing}` : ""}
            </p>
          </div>
          <Badge variant="outline" className={`${statusBadge.cls} shrink-0 text-xs`}>
            {statusBadge.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0 flex-1 flex flex-col gap-3">
        {/* ── Timeline ── */}
        <div className="space-y-1.5">
          {timeline.map((slot, i) => (
            <TimelineRow
              key={i}
              slot={slot}
              day={day}
              nowMin={nowMin}
              profileMap={profileMap}
            />
          ))}
        </div>

        {/* ── Next free slot footer ── */}
        <div className="flex items-center gap-1.5 text-xs border-t pt-2 text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span>Next free:</span>
          <span className={`font-medium ${nextFreeLabel === "Now" ? "text-green-700" : "text-foreground"}`}>
            {nextFreeLabel}
          </span>
        </div>

        {/* ── Actions ── */}
        <div className="flex gap-2 mt-auto">
          <Button asChild size="sm" variant="outline" className="flex-1">
            <Link to="/cabins/$cabinId" params={{ cabinId: cabin.id }}>
              Timeline
            </Link>
          </Button>
          <Button asChild size="sm" className="flex-1">
            <Link to="/book" search={{ cabinId: cabin.id, date, start: nextSlotShort ?? undefined }}>
              Book <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineRow({
  slot,
  day,
  nowMin,
  profileMap,
}: {
  slot: TimelineSlot;
  day: "today" | "tomorrow";
  nowMin: number;
  profileMap: Map<string, ProfileRow>;
}) {
  const slotStartMin = timeToMinutes(slot.start);
  const slotEndMin = timeToMinutes(slot.end);
  // Past slots are filtered before reaching here; isCurrent identifies the live slot
  const isCurrent = day === "today" && slotStartMin <= nowMin && nowMin < slotEndMin;

  const startLabel = formatTime12h(slot.start);
  const endLabel = formatTime12h(slot.end);
  const durationMin = slotEndMin - slotStartMin;

  /* ── Available slot ─────────────────────────────────────── */
  if (slot.type === "available") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 flex items-center gap-2.5">
        <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
        <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-green-900 tabular-nums whitespace-nowrap">
            {startLabel} – {endLabel}
          </p>
          <span className="text-xs font-semibold text-green-700 shrink-0">Available</span>
        </div>
      </div>
    );
  }

  /* ── Booked slot ────────────────────────────────────────── */
  const managerName = slot.userId ? (profileMap.get(slot.userId)?.full_name ?? "—") : "—";

  const theme = isCurrent
    ? {
        wrap: "border-orange-200 bg-orange-50",
        dot: "bg-orange-500",
        time: "text-orange-900",
        name: "text-orange-800",
        meta: "text-orange-600",
      }
    : {
        wrap: "border-red-200 bg-red-50",
        dot: "bg-red-500",
        time: "text-red-900",
        name: "text-red-800",
        meta: "text-red-500",
      };

  return (
    <div className={`rounded-lg border ${theme.wrap} px-3 py-2 flex items-start gap-2.5`}>
      <div className={`w-2 h-2 rounded-full ${theme.dot} shrink-0 mt-1`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-xs font-bold ${theme.time} tabular-nums whitespace-nowrap`}>
            {startLabel} – {endLabel}
          </p>
          {isCurrent && (
            <span className="text-[10px] font-semibold bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded-full leading-none">
              In Progress
            </span>
          )}
        </div>
        <p className={`text-xs font-medium ${theme.name} mt-0.5 truncate`}>
          {managerName}
        </p>
        {slot.candidateCount != null && (
          <p className={`text-[11px] ${theme.meta} mt-0.5`}>
            {slot.candidateCount} candidate{slot.candidateCount !== 1 ? "s" : ""} · {formatDuration(durationMin)}
          </p>
        )}
      </div>
    </div>
  );
}

