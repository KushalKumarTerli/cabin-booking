import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatTime } from "@/lib/booking-utils";

export const Route = createFileRoute("/_authenticated/_admin/admin/bookings")({
  component: AdminBookings,
});

interface BookingRow {
  id: string; booking_date: string; start_time: string; end_time: string;
  candidate_count: number; status: "active" | "cancelled" | "overridden"; purpose: string;
  cabin_id: string;
  cabins: { name: string; floor: string } | null;
  profiles: { full_name: string; department: string } | null;
}

function AdminBookings() {
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "cancelled" | "overridden">("all");

  const q = useQuery({
    queryKey: ["admin-bookings", date, status],
    queryFn: async () => {
      let qy = supabase
        .from("bookings")
        .select("id, booking_date, start_time, end_time, candidate_count, status, purpose, cabin_id, cabins(name, floor), profiles(full_name, department)")
        .order("booking_date", { ascending: false })
        .order("start_time")
        .limit(200);
      if (date) qy = qy.eq("booking_date", date);
      if (status !== "all") qy = qy.eq("status", status);
      const { data, error } = await qy;
      if (error) throw error;
      return data as unknown as BookingRow[];
    },
  });

  const setStatusFor = async (id: string, newStatus: "cancelled" | "overridden") => {
    const { error } = await supabase.from("bookings").update({ status: newStatus }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Booking ${newStatus}`);
      qc.invalidateQueries({ queryKey: ["admin-bookings"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this booking?")) return;
    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin-bookings"] });
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Bookings</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="overridden">Overridden</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => { setDate(""); setStatus("all"); }}>Clear</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{q.data?.length ?? 0} booking(s)</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(q.data ?? []).map((b) => (
              <li key={b.id} className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{b.cabins?.name}</span>
                    <span className="text-xs text-muted-foreground">{b.cabins?.floor}</span>
                    <Badge variant={b.status === "active" ? "default" : "secondary"} className="capitalize">{b.status}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {b.booking_date} · {formatTime(b.start_time)}–{formatTime(b.end_time)} · {b.candidate_count}c
                  </div>
                  <div className="text-xs text-muted-foreground">By {b.profiles?.full_name} ({b.profiles?.department})</div>
                </div>
                <div className="flex items-center gap-2">
                  {b.status === "active" && <Button size="sm" variant="outline" onClick={() => setStatusFor(b.id, "cancelled")}>Force cancel</Button>}
                  {b.status === "active" && <Button size="sm" variant="outline" onClick={() => setStatusFor(b.id, "overridden")}>Override</Button>}
                  <Button size="sm" variant="ghost" onClick={() => remove(b.id)} className="text-destructive">Delete</Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}