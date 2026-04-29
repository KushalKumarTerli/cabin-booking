import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import {
  formatTime,
  generateTimeSlots,
  generateEndTimeSlots,
  timeToMinutes,
  WORKING_END_EXTENDED,
  SLOT_MINUTES,
  computeEndTime,
} from "@/lib/booking-utils";

export const Route = createFileRoute("/_authenticated/_admin/admin/bookings")({
  component: AdminBookings,
});

interface CabinOption { id: string; name: string; floor: string; wing: string | null; }

interface BookingRow {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  candidate_count: number;
  status: "active" | "cancelled" | "overridden";
  purpose: string;
  cabin_id: string;
  cabins: { name: string; floor: string } | null;
  profiles: { full_name: string; department: string } | null;
}

interface EditState {
  id: string;
  cabin_id: string;
  start_time: string;
  end_time: string;
  candidate_count: number;
  purpose: string;
  booking_date: string;
}

function AdminBookings() {
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "cancelled" | "overridden">("all");
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

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

  const cabinsQ = useQuery({
    queryKey: ["cabins", "active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cabins").select("id, name, floor, wing").eq("is_active", true).order("floor").order("name");
      if (error) throw error;
      return data as CabinOption[];
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
    if (!confirm("Permanently delete this booking?")) return;
    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin-bookings"] });
    }
  };

  const openEdit = (b: BookingRow) => {
    setEditState({
      id: b.id,
      cabin_id: b.cabin_id,
      start_time: b.start_time,
      end_time: b.end_time,
      candidate_count: b.candidate_count,
      purpose: b.purpose,
      booking_date: b.booking_date,
    });
  };

  const saveEdit = async () => {
    if (!editState) return;
    setSaving(true);
    const { error } = await supabase.from("bookings").update({
      cabin_id: editState.cabin_id,
      start_time: editState.start_time,
      end_time: editState.end_time,
      candidate_count: editState.candidate_count,
      purpose: editState.purpose,
    }).eq("id", editState.id);
    setSaving(false);
    if (error) {
      if (error.message.includes("no_overlap_active") || error.code === "23P01") {
        toast.error("Time slot conflicts with another active booking for this cabin.");
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success("Booking updated");
      setEditState(null);
      qc.invalidateQueries({ queryKey: ["admin-bookings"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    }
  };

  // Auto-recalculate end time when start/candidates change in edit dialog
  const autoEditEnd = editState
    ? computeEndTime(editState.start_time, editState.candidate_count)
    : null;

  const startSlots = useMemo(() => generateTimeSlots(), []);
  const endSlots = useMemo(
    () => (editState ? generateEndTimeSlots(editState.start_time) : []),
    [editState?.start_time],
  );

  const editFitsDay = editState
    ? timeToMinutes(editState.end_time) <= timeToMinutes(WORKING_END_EXTENDED)
    : true;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Bookings</h1>

      {/* Filters */}
      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
          </div>
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

      {/* Booking list */}
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
                    {b.booking_date} · {formatTime(b.start_time)}–{formatTime(b.end_time)} · {b.candidate_count} candidate(s)
                  </div>
                  <div className="text-xs text-muted-foreground">
                    By {b.profiles?.full_name} ({b.profiles?.department})
                  </div>
                  <div className="text-xs text-muted-foreground italic truncate max-w-sm">{b.purpose}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => openEdit(b)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  {b.status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => setStatusFor(b.id, "cancelled")}>
                      Force Cancel
                    </Button>
                  )}
                  {b.status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => setStatusFor(b.id, "overridden")}>
                      Override
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(b.id)} className="text-destructive hover:text-destructive">
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editState} onOpenChange={(v) => { if (!v) setEditState(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Booking</DialogTitle>
          </DialogHeader>
          {editState && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Cabin</Label>
                <Select value={editState.cabin_id} onValueChange={(v) => setEditState({ ...editState, cabin_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(cabinsQ.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · {c.floor}{c.wing ? ` (${c.wing})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Candidates</Label>
                  <div className="flex items-center">
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-r-none"
                      onClick={() => setEditState({ ...editState, candidate_count: Math.max(1, editState.candidate_count - 1), end_time: computeEndTime(editState.start_time, Math.max(1, editState.candidate_count - 1)) })}>−</Button>
                    <Input
                      type="number" min={1}
                      value={editState.candidate_count}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v) && v >= 1) {
                          setEditState({ ...editState, candidate_count: v, end_time: computeEndTime(editState.start_time, v) });
                        }
                      }}
                      className="h-8 w-12 rounded-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-l-none"
                      onClick={() => setEditState({ ...editState, candidate_count: editState.candidate_count + 1, end_time: computeEndTime(editState.start_time, editState.candidate_count + 1) })}>+</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{editState.candidate_count * SLOT_MINUTES} min</p>
                </div>
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Select
                    value={editState.start_time}
                    onValueChange={(v) => setEditState({ ...editState, start_time: v, end_time: computeEndTime(v, editState.candidate_count) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {startSlots.map((s) => <SelectItem key={s} value={s}>{formatTime(s)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Select
                    value={editState.end_time}
                    onValueChange={(v) => setEditState({ ...editState, end_time: v })}
                  >
                    <SelectTrigger className={editState.end_time !== autoEditEnd ? "border-primary" : ""}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {endSlots.map((s) => (
                        <SelectItem key={s} value={s}>
                          {formatTime(s)}{s === autoEditEnd ? " (auto)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!editFitsDay && (
                <p className="text-sm text-destructive">End time exceeds 19:00 maximum.</p>
              )}

              <div className="space-y-2">
                <Label>Purpose</Label>
                <Textarea
                  rows={3}
                  value={editState.purpose}
                  onChange={(e) => setEditState({ ...editState, purpose: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditState(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving || !editFitsDay}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
