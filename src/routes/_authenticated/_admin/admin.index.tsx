import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { todayISO, formatTime } from "@/lib/booking-utils";
import { Building2, CalendarRange, Users, Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/admin/")({
  component: AdminOverview,
});

function AdminOverview() {
  const today = todayISO();

  const stats = useQuery({
    queryKey: ["admin-stats", today],
    queryFn: async () => {
      const [c, u, bToday, bAll] = await Promise.all([
        supabase.from("cabins").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("booking_date", today).eq("status", "active"),
        supabase.from("bookings").select("id", { count: "exact", head: true }),
      ]);
      return {
        cabins: c.count ?? 0,
        users: u.count ?? 0,
        today: bToday.count ?? 0,
        total: bAll.count ?? 0,
      };
    },
  });

  const todayBookings = useQuery({
    queryKey: ["admin-today", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, start_time, end_time, candidate_count, status, profiles(full_name), cabins(name, floor)")
        .eq("booking_date", today)
        .eq("status", "active")
        .order("start_time");
      if (error) throw error;
      return data as unknown as Array<{
        id: string; start_time: string; end_time: string; candidate_count: number; status: string;
        profiles: { full_name: string } | null;
        cabins: { name: string; floor: string } | null;
      }>;
    },
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin overview</h1>
        <p className="text-sm text-muted-foreground">Today is {today}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={<Building2 className="h-4 w-4" />} label="Active cabins" value={stats.data?.cabins} />
        <Stat icon={<Users className="h-4 w-4" />} label="Users" value={stats.data?.users} />
        <Stat icon={<CalendarRange className="h-4 w-4" />} label="Bookings today" value={stats.data?.today} />
        <Stat icon={<Activity className="h-4 w-4" />} label="Total bookings" value={stats.data?.total} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Today's bookings</CardTitle></CardHeader>
        <CardContent>
          {(todayBookings.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings today.</p>
          ) : (
            <ul className="divide-y">
              {todayBookings.data!.map((b) => (
                <li key={b.id} className="py-2 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{b.cabins?.name}</span>
                    <span className="text-muted-foreground"> · {b.cabins?.floor}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {b.profiles?.full_name} · {formatTime(b.start_time)}–{formatTime(b.end_time)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | undefined }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className="text-2xl font-bold mt-1">{value ?? "—"}</div>
      </CardContent>
    </Card>
  );
}