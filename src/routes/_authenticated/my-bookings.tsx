import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatTime, todayISO } from "@/lib/booking-utils";

export const Route = createFileRoute("/_authenticated/my-bookings")({
  component: MyBookings,
});

interface BookingRow {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  candidate_count: number;
  purpose: string;
  status: "active" | "cancelled" | "overridden";
  cabins: { name: string; floor: string; wing: string | null } | null;
}

function MyBookings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = todayISO();

  const q = useQuery({
    queryKey: ["my-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_date, start_time, end_time, candidate_count, purpose, status, cabins(name, floor, wing)")
        .eq("user_id", user!.id)
        .order("booking_date", { ascending: false })
        .order("start_time", { ascending: false });
      if (error) throw error;
      return data as unknown as BookingRow[];
    },
  });

  const cancel = async (id: string) => {
    const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Booking cancelled");
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    }
  };

  const upcoming = (q.data ?? []).filter((b) => b.booking_date >= today);
  const past = (q.data ?? []).filter((b) => b.booking_date < today);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">My bookings</h1>
      <Section title="Upcoming" rows={upcoming} canCancel onCancel={cancel} />
      <Section title="Past" rows={past} canCancel={false} onCancel={cancel} />
    </div>
  );
}

function Section({ title, rows, canCancel, onCancel }: { title: string; rows: BookingRow[]; canCancel: boolean; onCancel: (id: string) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title} ({rows.length})</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bookings.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((b) => (
              <li key={b.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{b.cabins?.name ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">{b.cabins?.floor}{b.cabins?.wing ? ` · ${b.cabins.wing}` : ""}</span>
                    {b.status !== "active" && <Badge variant="secondary" className="capitalize">{b.status}</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {b.booking_date} · {formatTime(b.start_time)}–{formatTime(b.end_time)} · {b.candidate_count} candidate(s)
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">{b.purpose}</div>
                </div>
                {canCancel && b.status === "active" && (
                  <Button size="sm" variant="outline" onClick={() => onCancel(b.id)}>Cancel</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}